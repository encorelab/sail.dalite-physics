$: << 'sail.rb/lib'

require 'sail/rollcall/user'
require 'sail/rollcall/group'
require 'sail/rollcall/run'

class User < Rollcall::User
  
  def current_expertise_group
    exp_ids = Expertise.groups.collect{|g| g.id}
    groups = self.groups.select{|g| exp_ids.include? g.id}
    if groups.empty?
      return nil
    else
      # TODO: ensure that user is never assigned to more than one expertise group
      return groups.first
    end
  end
  
  def is_already_in_expertise_group?
    not current_expertise_group.nil?
  end
  
  def last_unanswered_question_id
    self.metadata.last_unanswered_question_id
  end
  
  def homework_completed?
    begin
      [true, "true"].include? self.metadata.homework_completed
    rescue NoMethodError
      return false
    end
  end
  
  def homework_completed!
    self.metadata.homework_completed = true
    self.save
  end
  
  def question_assigned!(question_id)
    self.metadata.last_unanswered_question_id = question_id
    self.save
  end
  
  def question_answered!(question_id)
    begin
      last_unanswered = self.metadata.last_unanswered_question_id
      if last_unanswered.to_i == question_id.to_i
        self.metadata.last_unanswered_question_id = nil
        self.save
      end
    rescue NoMethodError
    end
  end
  
  def randomly_assign_to_expertise_group!
    Expertise.add_member_to_random(self)
  end
  
end

class Group < Rollcall::Group
end

class Expertise < Group
  self.element_name = "group"
  
  def self.groups
    #r = Rollcall::Run.find(RUN_ID)
    Group.find(:all, :from => "/runs/#{RUN_ID}/groups", :params => {:kind => "Expertise"})
  end
  
  def self.add_member_to_random(member)
    Expertise.put(:add_member_to_random, {
      :ids => Expertise.groups.collect{|g| g.id}, 
      :distribution => 'uniform',
      :member => {:id => member.id, :type => member.class}
    })
  end
  
end
